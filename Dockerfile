FROM ruby:2.6
COPY ./uploads/1573833947211-todos.zip /usr/src/app/
WORKDIR /usr/src/app
RUN unzip 1573833947211-todos.zip
RUN bundle install
EXPOSE 4567

CMD ["bundle", "exec", "puma", "-t", "5:5", "-p", "4567"]